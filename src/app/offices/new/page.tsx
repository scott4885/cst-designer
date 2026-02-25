"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getSettings } from "@/lib/settings";
// createOffice uses API route

const DEFAULT_SCHEDULING_RULES = `# Office Scheduling Rules

## Standard Rules
- Default appointment duration: 10-minute increments
- High Production appointments should be placed in the morning when possible
- New Patient exams: limit to 2 per doctor per day
- Emergency/same-day slots: reserve 1 slot per morning and afternoon

## Provider-Specific Rules
<!-- Add provider-specific rules here -->
<!-- Example: "Dr. Smith cannot be scheduled in Operatory 4 after 12:00 PM" -->

## Appointment Sequencing
<!-- Example: "Leave 20 minutes after each crown prep" -->

## Other Notes
<!-- Add any other office-specific scheduling notes here -->
`;

// Form schema
const officeSchema = z.object({
  name: z.string().min(1, "Office name is required"),
  dpms: z.enum(["Dentrix", "Open Dental", "Eaglesoft", "Denticon"]),
  workingDays: z.array(z.string()).min(1, "Select at least one working day"),
  staggerMinutes: z.number().min(0).max(120),
  providers: z.array(
    z.object({
      name: z.string().min(1, "Provider name is required"),
      role: z.enum(["Doctor", "Hygienist"]),
      operatories: z.array(z.string()).min(1, "Select at least one operatory"),
      workingHours: z.object({
        start: z.string(),
        end: z.string(),
      }),
      lunchEnabled: z.boolean(),
      lunchBreak: z.object({
        start: z.string(),
        end: z.string(),
      }),
      dailyGoal: z.number().min(0),
      color: z.string(),
    })
  ).min(1, "Add at least one provider"),
  procedures: z.array(
    z.object({
      name: z.string(),
      duration: z.number(),
      role: z.enum(["Doctor", "Hygienist", "Both"]),
    })
  ),
  scheduleRules: z.object({
    npModel: z.enum(["doctor_only", "hygienist_only", "either"]),
    npBlocksPerDay: z.number().min(1).max(3),
    srpBlocksPerDay: z.number().min(1).max(3),
    hpPlacement: z.enum(["morning", "afternoon", "any"]),
    doubleBooking: z.boolean(),
    matrixing: z.boolean(),
  }),
  schedulingRules: z.string().optional(),
});

type OfficeFormData = z.infer<typeof officeSchema>;

const WORKING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const OPERATORIES = ["OP1", "OP2", "OP3", "OP4", "OP5", "HYG1", "HYG2", "HYG3", "HYG4", "Main", "Consult Room"];
const PROVIDER_COLORS = ["#ec8a1b", "#87bcf3", "#f4de37", "#44f2ce", "#ff6b9d", "#9b59b6"];

const DEFAULT_PROCEDURES = [
  // Doctor procedures — mirrors the global Appointment Library defaults
  { name: "HP", duration: 60, role: "Doctor" as const },
  { name: "Crown Prep", duration: 60, role: "Doctor" as const },
  { name: "MP", duration: 40, role: "Doctor" as const },
  { name: "NP CONS", duration: 40, role: "Doctor" as const },
  { name: "NON-PROD", duration: 25, role: "Doctor" as const },
  { name: "ER", duration: 25, role: "Doctor" as const },
  // Hygienist procedures
  { name: "Recare", duration: 55, role: "Hygienist" as const },
  { name: "PM", duration: 60, role: "Hygienist" as const },
  { name: "SRP", duration: 75, role: "Hygienist" as const },
  { name: "NPE", duration: 60, role: "Hygienist" as const },
];

function inferMinimumAmount(name: string): number {
  const n = name.toUpperCase();
  if (n.includes('CROWN') || n.includes('IMPLANT') || n.includes('BRIDGE') || n.includes('VENEER') || n.includes('ENDO') || n.includes('HP'))
    return 1200;
  if (n.includes('MP') || n.includes('FILL') || n.includes('MEDIUM') || n.includes('RESTO'))
    return 375;
  if (n.includes('NP') || n.includes('CONSULT') || n.includes('NEW PAT'))
    return 300;
  if (n.includes('ER') || n.includes('EMERG'))
    return 187;
  if (n.includes('SRP') || n.includes('AHT') || n.includes('SCALING'))
    return 300;
  if (n.includes('PM') || n.includes('PERIO MAINT'))
    return 190;
  if (n.includes('RECARE') || n.includes('RECALL') || n.includes('PROPHY'))
    return 150;
  if (n.includes('NON-PROD') || n.includes('SEAT') || n.includes('ADJUST'))
    return 0;
  return 0;
}

export default function NewOfficePage() {
  return (
    <Suspense>
      <NewOfficeForm />
    </Suspense>
  );
}

function NewOfficeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "practice");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  const DRAFT_KEY = 'schedule-designer-draft-new';

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Use window.history.replaceState directly to avoid Next.js re-rendering
    // the Suspense boundary (which would wipe form state).
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    window.history.replaceState(null, '', `?${params.toString()}`);
  };


  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<OfficeFormData>({
    resolver: zodResolver(officeSchema),
    mode: "onBlur",
    defaultValues: {
      workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      staggerMinutes: 0,
      providers: [],
      procedures: DEFAULT_PROCEDURES,
      scheduleRules: {
        npModel: "either",
        npBlocksPerDay: 2,
        srpBlocksPerDay: 2,
        hpPlacement: "any",
        doubleBooking: false,
        matrixing: true,
      },
      schedulingRules: DEFAULT_SCHEDULING_RULES,
    },
  });

  const { fields: providerFields, append: appendProvider, remove: removeProvider } = useFieldArray({
    control,
    name: "providers",
  });

  const { fields: procedureFields, update: updateProcedure } = useFieldArray({
    control,
    name: "procedures",
  });

  const workingDays = watch("workingDays");
  const watchProviders = watch("providers");

  const toggleWorkingDay = (day: string) => {
    const current = workingDays || [];
    if (current.includes(day)) {
      setValue("workingDays", current.filter((d) => d !== day));
    } else {
      setValue("workingDays", [...current, day]);
    }
  };

  const addProvider = () => {
    const s = getSettings();
    appendProvider({
      name: "",
      role: "Doctor",
      operatories: ["OP1"],
      workingHours: { start: s.defaultStartTime, end: s.defaultEndTime },
      lunchEnabled: true,
      lunchBreak: { start: s.defaultLunchStart, end: s.defaultLunchEnd },
      dailyGoal: 5000,
      color: PROVIDER_COLORS[providerFields.length % PROVIDER_COLORS.length],
    });
  };

  const onSubmit = async (data: OfficeFormData) => {
    setIsSubmitting(true);
    try {
      const generateId = () =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const staggerMin = data.staggerMinutes || 0;
      let doctorIndex = 0;
      const providers = (data.providers || []).map((p) => {
        const isDoctor = p.role === "Doctor";
        const staggerOffsetMin = isDoctor && staggerMin > 0 ? doctorIndex * staggerMin : undefined;
        if (isDoctor) doctorIndex++;
        return {
          id: generateId(),
          name: p.name,
          role: (p.role === "Doctor" ? "DOCTOR" : "HYGIENIST") as "DOCTOR" | "HYGIENIST",
          operatories: p.operatories || ["OP1"],
          workingStart: p.workingHours?.start || "07:00",
          workingEnd: p.workingHours?.end || "16:00",
          lunchEnabled: p.lunchEnabled !== false,
          lunchStart: p.lunchEnabled !== false ? (p.lunchBreak?.start || "12:00") : "",
          lunchEnd: p.lunchEnabled !== false ? (p.lunchBreak?.end || "13:00") : "",
          dailyGoal: p.dailyGoal || 0,
          color: p.color || "#666",
          ...(staggerOffsetMin !== undefined && { staggerOffsetMin }),
        };
      });

      const blockTypes = (data.procedures || []).map((b) => ({
        id: generateId(),
        label: b.name,
        description: "",
        minimumAmount: inferMinimumAmount(b.name),
        appliesToRole: (b.role === "Doctor"
          ? "DOCTOR"
          : b.role === "Hygienist"
          ? "HYGIENIST"
          : "BOTH") as "DOCTOR" | "HYGIENIST" | "BOTH",
        durationMin: b.duration || 30,
        durationMax: b.duration || 30,
      }));

      const rules = {
        npModel: (data.scheduleRules?.npModel?.toUpperCase() || "DOCTOR_ONLY") as
          | "DOCTOR_ONLY"
          | "HYGIENIST_ONLY"
          | "EITHER",
        npBlocksPerDay: data.scheduleRules?.npBlocksPerDay || 2,
        srpBlocksPerDay: data.scheduleRules?.srpBlocksPerDay || 2,
        hpPlacement: (data.scheduleRules?.hpPlacement?.toUpperCase() || "MORNING") as
          | "MORNING"
          | "AFTERNOON"
          | "ANY",
        doubleBooking: data.scheduleRules?.doubleBooking || false,
        matrixing: data.scheduleRules?.matrixing !== false,
        emergencyHandling: "ACCESS_BLOCKS" as "DEDICATED" | "FLEX" | "ACCESS_BLOCKS",
      };

      const workingDays = (data.workingDays || []).map((day) => {
        const dayMap: Record<string, string> = {
          Mon: "MONDAY",
          Tue: "TUESDAY",
          Wed: "WEDNESDAY",
          Thu: "THURSDAY",
          Fri: "FRIDAY",
        };
        return dayMap[day] || day.toUpperCase();
      });

      const settings = getSettings();
      const res = await fetch('/api/offices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          dpmsSystem: data.dpms.toUpperCase().replace(" ", "_"),
          workingDays,
          timeIncrement: settings.timeIncrement,
          feeModel: "UCR",
          providers,
          blockTypes,
          rules,
          schedulingRules: data.schedulingRules || "",
        }),
      });
      if (!res.ok) throw new Error('Failed to create office');
      const newOffice = await res.json();

      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Office created successfully!");
      router.push(`/offices/${newOffice.id}`);
    } catch (error) {
      console.error("Error creating office:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create office");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl+S to submit (placed here so handleSubmit/onSubmit are in scope)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSubmit(onSubmit)();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit]);

  // localStorage draft: check for saved draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { savedAt: string; data: OfficeFormData };
        if (parsed?.savedAt) {
          setDraftSavedAt(parsed.savedAt);
          setShowDraftBanner(true);
        }
      }
    } catch { /* ignore parse errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    router.push("/");
  };

  // Set page title
  useEffect(() => {
    document.title = "New Office - Custom Schedule Template";
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Create New Office</h1>
          <p className="text-muted-foreground mt-1">
            Set up a new dental office schedule template
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
                    const parsed = JSON.parse(raw) as { savedAt: string; data: OfficeFormData };
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

      {/* Tabbed Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="practice" className="text-xs sm:text-sm">1. Practice</TabsTrigger>
            <TabsTrigger value="providers" className="text-xs sm:text-sm">2. Providers</TabsTrigger>
            <TabsTrigger value="timing" className="text-xs sm:text-sm">3. Timing</TabsTrigger>
            <TabsTrigger value="rules" className="text-xs sm:text-sm">4. Rules</TabsTrigger>
          </TabsList>

          {/* Tab 1: Practice Foundation */}
          <TabsContent value="practice" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Practice Information</CardTitle>
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
                  <Label htmlFor="dpms">DPMS System</Label>
                  <Select onValueChange={(value) => setValue("dpms", value as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select DPMS" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dentrix">Dentrix</SelectItem>
                      <SelectItem value="Open Dental">Open Dental</SelectItem>
                      <SelectItem value="Eaglesoft">Eaglesoft</SelectItem>
                      <SelectItem value="Denticon">Denticon</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.dpms && (
                    <p className="text-sm text-error mt-1">{errors.dpms.message}</p>
                  )}
                </div>

                <div>
                  <Label>Working Days</Label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {WORKING_DAYS.map((day) => (
                      <Button
                        key={day}
                        type="button"
                        variant={workingDays?.includes(day) ? "default" : "outline"}
                        onClick={() => toggleWorkingDay(day)}
                        aria-pressed={workingDays?.includes(day)}
                        className="flex-1 min-w-[52px] min-h-[44px]"
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                  {errors.workingDays && (
                    <p className="text-sm text-error mt-1">{errors.workingDays.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="button" onClick={() => handleTabChange("providers")} className="w-full sm:w-auto min-h-[44px]">
                Next: Providers
              </Button>
            </div>
          </TabsContent>

          {/* Tab 2: Providers */}
          <TabsContent value="providers" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Providers</CardTitle>
                <Button type="button" onClick={addProvider} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Provider
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Doctor start stagger */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                  <div className="flex-1">
                    <Label htmlFor="staggerMinutes" className="font-medium">Doctor start stagger (min)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When multiple doctors are present, each successive doctor starts this many minutes later
                      (e.g. 30 → Doctor 1 at 7:00, Doctor 2 at 7:30). Set to 0 to disable.
                    </p>
                  </div>
                  <Input
                    id="staggerMinutes"
                    type="number"
                    min={0}
                    max={120}
                    step={15}
                    {...register("staggerMinutes", { valueAsNumber: true })}
                    className="w-24 shrink-0"
                    placeholder="0"
                  />
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
                        onClick={() => removeProvider(index)}
                      >
                        <Trash2 className="w-4 h-4 text-error" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Name</Label>
                        <Input {...register(`providers.${index}.name`)} placeholder="Dr. John Doe" />
                      </div>
                      <div>
                        <Label>Role</Label>
                        <Select
                          onValueChange={(value) => {
                            setValue(`providers.${index}.role`, value as any);
                            // Auto-update daily goal when role changes
                            const currentGoal = watchProviders?.[index]?.dailyGoal;
                            if (value === "Hygienist" && (currentGoal === 5000 || !currentGoal)) {
                              setValue(`providers.${index}.dailyGoal`, 1500);
                            } else if (value === "Doctor" && currentGoal === 1500) {
                              setValue(`providers.${index}.dailyGoal`, 5000);
                            }
                          }}
                          defaultValue={field.role}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Doctor">Doctor</SelectItem>
                            <SelectItem value="Hygienist">Hygienist</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Daily Goal ($)</Label>
                        <Input
                          type="number"
                          {...register(`providers.${index}.dailyGoal`, { valueAsNumber: true })}
                          placeholder={watchProviders?.[index]?.role === "Hygienist" ? "1500" : "5000"}
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
                          <Input type="time" {...register(`providers.${index}.workingHours.start`)} className="flex-1" />
                          <span className="self-center text-sm text-muted-foreground text-center">to</span>
                          <Input type="time" {...register(`providers.${index}.workingHours.end`)} className="flex-1" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">e.g. 7:00 AM – 4:00 PM</p>
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
                              <Input type="time" {...register(`providers.${index}.lunchBreak.start`)} className="flex-1" />
                              <span className="self-center text-sm text-muted-foreground text-center">to</span>
                              <Input type="time" {...register(`providers.${index}.lunchBreak.end`)} className="flex-1" />
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
                                id={`provider-${index}-op-${op}`}
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
                                htmlFor={`provider-${index}-op-${op}`}
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
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => handleTabChange("practice")} className="w-full sm:w-auto min-h-[44px]">
                Back
              </Button>
              <Button type="button" onClick={() => handleTabChange("timing")} className="w-full sm:w-auto min-h-[44px]">
                Next: Clinical Timing
              </Button>
            </div>
          </TabsContent>

          {/* Tab 3: Clinical Timing */}
          <TabsContent value="timing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Procedure Durations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {procedureFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                      <div>
                        <Input {...register(`procedures.${index}.name`)} className="text-sm" />
                      </div>
                      <div>
                        <Input
                          type="number"
                          {...register(`procedures.${index}.duration`, { valueAsNumber: true })}
                          placeholder="60"
                          className="text-sm"
                        />
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground truncate">{field.role}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => handleTabChange("providers")} className="w-full sm:w-auto min-h-[44px]">
                Back
              </Button>
              <Button type="button" onClick={() => handleTabChange("rules")} className="w-full sm:w-auto min-h-[44px]">
                Next: Schedule Rules
              </Button>
            </div>
          </TabsContent>

          {/* Tab 4: Schedule Rules */}
          <TabsContent value="rules" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Schedule Rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>NP Model</Label>
                  <Select
                    onValueChange={(value) => setValue("scheduleRules.npModel", value as any)}
                    defaultValue="either"
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="doctor_only">Doctor Only</SelectItem>
                      <SelectItem value="hygienist_only">Hygienist Only</SelectItem>
                      <SelectItem value="either">Either</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="npBlocksPerDay">NP Blocks Per Day</Label>
                    <Input
                      id="npBlocksPerDay"
                      type="number"
                      min={1}
                      max={3}
                      {...register("scheduleRules.npBlocksPerDay", { valueAsNumber: true })}
                      placeholder="2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">How many new patient slots per day (1–3)</p>
                  </div>
                  <div>
                    <Label htmlFor="srpBlocksPerDay">SRP Blocks Per Day</Label>
                    <Input
                      id="srpBlocksPerDay"
                      type="number"
                      min={1}
                      max={3}
                      {...register("scheduleRules.srpBlocksPerDay", { valueAsNumber: true })}
                      placeholder="2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">How many SRP slots per day (1–3)</p>
                  </div>
                </div>

                <div>
                  <Label>HP Block Placement</Label>
                  <Select
                    onValueChange={(value) => setValue("scheduleRules.hpPlacement", value as any)}
                    defaultValue="any"
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning Preferred</SelectItem>
                      <SelectItem value="afternoon">Afternoon Preferred</SelectItem>
                      <SelectItem value="any">Any Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="cursor-pointer font-medium">Enable Double Booking</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When enabled, doctors are scheduled across multiple operatories simultaneously.
                      When disabled, a single-column schedule is generated per doctor.
                    </p>
                  </div>
                  <Switch
                    id="new-double-booking"
                    checked={watch("scheduleRules.doubleBooking") === true}
                    onCheckedChange={(checked) => setValue("scheduleRules.doubleBooking", checked, { shouldDirty: true })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="cursor-pointer font-medium">Enable Matrixing (D/A Codes)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When enabled, dentist schedules include assistant (A) and doctor-exam (D) staffing codes for hygiene blocks.
                    </p>
                  </div>
                  <Switch
                    id="new-matrixing"
                    checked={watch("scheduleRules.matrixing") !== false}
                    onCheckedChange={(checked) => setValue("scheduleRules.matrixing", checked, { shouldDirty: true })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Office-Specific Scheduling Rules</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  {...register("schedulingRules")}
                  className="min-h-[240px] font-mono text-sm"
                  placeholder="Enter office-specific scheduling rules..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Supports markdown. Use headings, lists, and comments to document custom rules.
                </p>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => handleTabChange("timing")} className="w-full sm:w-auto min-h-[44px]">
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto min-h-[44px]">
                {isSubmitting ? "Creating..." : "Create Office"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Tip: Press ⌘S / Ctrl+S to save from any tab
        </p>
      </form>
    </div>
  );
}
