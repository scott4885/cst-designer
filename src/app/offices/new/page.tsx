"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
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
import { throwIfError } from "@/lib/api-error";

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

export default function NewOfficePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("practice");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    formState: { errors },
  } = useForm<OfficeFormData>({
    resolver: zodResolver(officeSchema),
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
      const response = await fetch("/api/offices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: data.name,
          dpmsSystem: data.dpms,
          workingDays: data.workingDays,
          providers: data.providers,
          blockTypes: data.procedures.map(p => ({
            label: p.name,
            duration: p.duration,
            role: p.role,
          })),
          rules: data.scheduleRules,
        }),
      });

      await throwIfError(response, "Failed to create office");

      const newOffice = await response.json();
      toast.success("Office created successfully!");
      router.push(`/offices/${newOffice.id}`);
    } catch (error) {
      console.error("Error creating office:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create office");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Set page title
  useEffect(() => {
    document.title = "New Office - Schedule Template Designer";
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create New Office</h1>
          <p className="text-muted-foreground mt-1">
            Set up a new dental office schedule template
          </p>
        </div>
      </div>

      {/* Tabbed Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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
              <Button type="button" onClick={() => setActiveTab("providers")}>
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
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            {...register(`providers.${index}.color`)}
                            className="w-16 h-10"
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
                      </div>
                      <div>
                        <Label>Lunch Break</Label>
                        <div className="flex gap-2">
                          <Input type="time" {...register(`providers.${index}.lunchBreak.start`)} />
                          <span className="self-center">to</span>
                          <Input type="time" {...register(`providers.${index}.lunchBreak.end`)} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("practice")}>
                Back
              </Button>
              <Button type="button" onClick={() => setActiveTab("timing")}>
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
              <Button type="button" variant="outline" onClick={() => setActiveTab("providers")}>
                Back
              </Button>
              <Button type="button" onClick={() => setActiveTab("rules")}>
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
              <Button type="button" variant="outline" onClick={() => setActiveTab("timing")}>
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
