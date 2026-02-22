"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useOfficeStore } from "@/store/office-store";
import { ConfirmDialog } from "@/components/ConfirmDialog";
// updateOffice uses API route
import type { BlockTypeInput } from "@/lib/engine/types";

// Form schema for editing
const editOfficeSchema = z.object({
  name: z.string().min(1, "Office name is required"),
  providers: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1, "Provider name is required"),
      role: z.enum(["DOCTOR", "HYGIENIST", "OTHER"]),
      operatories: z.array(z.string()).min(1, "Select at least one operatory"),
      columns: z.number().min(1).max(3).optional(),
      workingStart: z.string(),
      workingEnd: z.string(),
      lunchStart: z.string().optional(),
      lunchEnd: z.string().optional(),
      dailyGoal: z.number().min(0),
      color: z.string(),
      seesNewPatients: z.boolean().optional(),
      enabledBlockTypeIds: z.array(z.string()).optional(),
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
      reset({
        name: currentOffice.name,
        providers: currentOffice.providers?.map(p => ({
          id: p.id,
          name: p.name,
          role: p.role,
          operatories: p.operatories || ["OP1"],
          columns: (p as any).columns ?? 1,
          workingStart: p.workingStart || "07:00",
          workingEnd: p.workingEnd || "18:00",
          lunchStart: p.lunchStart || "13:00",
          lunchEnd: p.lunchEnd || "14:00",
          dailyGoal: p.dailyGoal || 5000,
          color: p.color || "#666",
          seesNewPatients: p.seesNewPatients !== false,
          enabledBlockTypeIds: p.enabledBlockTypeIds || [],
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

  const addProvider = () => {
    appendProvider({
      name: "",
      role: "DOCTOR",
      operatories: ["OP1"],
      columns: 1,
      workingStart: "07:00",
      workingEnd: "18:00",
      lunchStart: "13:00",
      lunchEnd: "14:00",
      dailyGoal: 5000,
      color: PROVIDER_COLORS[providerFields.length % PROVIDER_COLORS.length],
      seesNewPatients: true,
      enabledBlockTypeIds: [],
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

      const providers = data.providers.map((provider) => ({
        ...provider,
        id: provider.id || generateId(),
      }));

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
          providers,
          ...(rules ? { rules } : {}),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update office");
      }

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
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Office</h1>
          <p className="text-muted-foreground mt-1">
            Update office information and providers
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Office Name */}
        <Card>
          <CardHeader>
            <CardTitle>Office Information</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Providers */}
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
                    onClick={() => setProviderToDelete(index)}
                  >
                    <Trash2 className="w-4 h-4 text-error" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                        setValue(`providers.${index}.role`, value as any)
                      }
                      defaultValue={field.role}
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

                {currentOffice?.blockTypes && currentOffice.blockTypes.length > 0 && (
                  <div>
                    <Label className="mb-2 block">Appointment Types Handled</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Leave all unchecked to handle all applicable types
                    </p>
                    <div className="grid grid-cols-2 gap-2 border border-border rounded-lg p-3">
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
                      <Input type="time" {...register(`providers.${index}.workingStart`)} />
                      <span className="self-center">to</span>
                      <Input type="time" {...register(`providers.${index}.workingEnd`)} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">e.g. 7:00 AM – 5:00 PM</p>
                  </div>
                  <div>
                    <Label>Lunch Break</Label>
                    <div className="flex gap-2">
                      <Input type="time" {...register(`providers.${index}.lunchStart`)} />
                      <span className="self-center">to</span>
                      <Input type="time" {...register(`providers.${index}.lunchEnd`)} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">e.g. 12:00 PM – 1:00 PM</p>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Operatory Assignment</Label>
                  <p className="text-xs text-muted-foreground mb-2">Select which operatories this provider works in</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 border border-border rounded-lg p-3">
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
            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-2 gap-4">
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

        {/* Actions */}
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={handleBack}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
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
