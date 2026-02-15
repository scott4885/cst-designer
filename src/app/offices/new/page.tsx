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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getSettings } from "@/lib/settings";
import { createOffice } from "@/lib/local-storage";

// Form schema
const officeSchema = z.object({
  name: z.string().min(1, "Office name is required"),
  dpms: z.enum(["Dentrix", "Open Dental", "Eaglesoft", "Denticon"]),
  workingDays: z.array(z.string()).min(1, "Select at least one working day"),
  providers: z.array(
    z.object({
      name: z.string().min(1, "Provider name is required"),
      role: z.enum(["Doctor", "Hygienist"]),
      operatories: z.array(z.string()).min(1, "Select at least one operatory"),
      workingHours: z.object({
        start: z.string(),
        end: z.string(),
      }),
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
});

type OfficeFormData = z.infer<typeof officeSchema>;

const WORKING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const OPERATORIES = ["OP1", "OP2", "OP3", "OP4", "OP5", "Main", "Consult Room"];
const PROVIDER_COLORS = ["#ec8a1b", "#87bcf3", "#f4de37", "#44f2ce", "#ff6b9d", "#9b59b6"];

const DEFAULT_PROCEDURES = [
  { name: "Crown prep + buildup", duration: 60, role: "Doctor" as const },
  { name: "Medium production/fillings", duration: 40, role: "Doctor" as const },
  { name: "NP consult", duration: 40, role: "Doctor" as const },
  { name: "Emergency (ER)", duration: 25, role: "Doctor" as const },
  { name: "Recare", duration: 55, role: "Hygienist" as const },
  { name: "Perio Maintenance (PM)", duration: 60, role: "Hygienist" as const },
  { name: "SRP", duration: 75, role: "Hygienist" as const },
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

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Keyboard shortcut: Cmd/Ctrl+S to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSubmit(onSubmit)();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<OfficeFormData>({
    resolver: zodResolver(officeSchema),
    mode: "onBlur",
    defaultValues: {
      workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
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

      const providers = (data.providers || []).map((p) => ({
        id: generateId(),
        name: p.name,
        role: (p.role === "Doctor" ? "DOCTOR" : "HYGIENIST") as "DOCTOR" | "HYGIENIST",
        operatories: p.operatories || ["OP1"],
        workingStart: p.workingHours?.start || "07:00",
        workingEnd: p.workingHours?.end || "18:00",
        lunchStart: p.lunchBreak?.start || "13:00",
        lunchEnd: p.lunchBreak?.end || "14:00",
        dailyGoal: p.dailyGoal || 0,
        color: p.color || "#666",
      }));

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
      const newOffice = await createOffice({
        name: data.name,
        dpmsSystem: data.dpms.toUpperCase().replace(" ", "_"),
        workingDays,
        timeIncrement: settings.timeIncrement,
        feeModel: "UCR",
        providers,
        blockTypes,
        rules,
      });

      toast.success("Office created successfully!");
      router.push(`/offices/${newOffice.id}`);
    } catch (error) {
      console.error("Error creating office:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create office");
    } finally {
      setIsSubmitting(false);
    }
  };

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
    document.title = "New Office - Schedule Template Designer";
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create New Office</h1>
          <p className="text-muted-foreground mt-1">
            Set up a new dental office schedule template
          </p>
        </div>
      </div>

      {/* Tabbed Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="practice">1. Practice Foundation</TabsTrigger>
            <TabsTrigger value="providers">2. Providers</TabsTrigger>
            <TabsTrigger value="timing">3. Clinical Timing</TabsTrigger>
            <TabsTrigger value="rules">4. Schedule Rules</TabsTrigger>
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
                  <div className="flex gap-2 mt-2">
                    {WORKING_DAYS.map((day) => (
                      <Button
                        key={day}
                        type="button"
                        variant={workingDays?.includes(day) ? "default" : "outline"}
                        onClick={() => toggleWorkingDay(day)}
                        aria-pressed={workingDays?.includes(day)}
                        className="flex-1"
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
              <Button type="button" onClick={() => handleTabChange("providers")}>
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

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Name</Label>
                        <Input {...register(`providers.${index}.name`)} placeholder="Dr. John Doe" />
                      </div>
                      <div>
                        <Label>Role</Label>
                        <Select
                          onValueChange={(value) =>
                            setValue(`providers.${index}.role`, value as any)
                          }
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

                    <div className="grid grid-cols-2 gap-4">
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

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Working Hours</Label>
                        <div className="flex gap-2">
                          <Input type="time" {...register(`providers.${index}.workingHours.start`)} />
                          <span className="self-center">to</span>
                          <Input type="time" {...register(`providers.${index}.workingHours.end`)} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">e.g. 7:00 AM – 5:00 PM</p>
                      </div>
                      <div>
                        <Label>Lunch Break</Label>
                        <div className="flex gap-2">
                          <Input type="time" {...register(`providers.${index}.lunchBreak.start`)} />
                          <span className="self-center">to</span>
                          <Input type="time" {...register(`providers.${index}.lunchBreak.end`)} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">e.g. 12:00 PM – 1:00 PM</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => handleTabChange("practice")}>
                Back
              </Button>
              <Button type="button" onClick={() => handleTabChange("timing")}>
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
                    <div key={field.id} className="grid grid-cols-3 gap-4 items-center">
                      <div>
                        <Input {...register(`procedures.${index}.name`)} />
                      </div>
                      <div>
                        <Input
                          type="number"
                          {...register(`procedures.${index}.duration`, { valueAsNumber: true })}
                          placeholder="60"
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">{field.role}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => handleTabChange("providers")}>
                Back
              </Button>
              <Button type="button" onClick={() => handleTabChange("rules")}>
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
                  <Label>Enable Double Booking</Label>
                  <Switch
                    onCheckedChange={(checked) => setValue("scheduleRules.doubleBooking", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Enable Matrixing</Label>
                  <Switch
                    defaultChecked
                    onCheckedChange={(checked) => setValue("scheduleRules.matrixing", checked)}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => handleTabChange("timing")}>
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting}>
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
