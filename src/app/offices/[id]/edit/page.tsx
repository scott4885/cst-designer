"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useOfficeStore } from "@/store/office-store";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Form schema for editing
const editOfficeSchema = z.object({
  name: z.string().min(1, "Office name is required"),
  providers: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1, "Provider name is required"),
      role: z.enum(["DOCTOR", "HYGIENIST"]),
      operatories: z.array(z.string()).min(1, "Select at least one operatory"),
      workingStart: z.string(),
      workingEnd: z.string(),
      lunchStart: z.string().optional(),
      lunchEnd: z.string().optional(),
      dailyGoal: z.number().min(0),
      color: z.string(),
    })
  ).min(1, "Add at least one provider"),
});

type EditOfficeFormData = z.infer<typeof editOfficeSchema>;

const OPERATORIES = ["OP1", "OP2", "OP3", "OP4", "OP5", "Main", "Consult Room"];
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
    reset,
    formState: { errors },
  } = useForm<EditOfficeFormData>({
    resolver: zodResolver(editOfficeSchema),
    defaultValues: {
      name: "",
      providers: [],
    },
  });

  const { fields: providerFields, append: appendProvider, remove: removeProvider } = useFieldArray({
    control,
    name: "providers",
  });

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
      reset({
        name: currentOffice.name,
        providers: currentOffice.providers?.map(p => ({
          id: p.id,
          name: p.name,
          role: p.role,
          operatories: p.operatories || ["OP1"],
          workingStart: p.workingStart || "07:00",
          workingEnd: p.workingEnd || "18:00",
          lunchStart: p.lunchStart || "13:00",
          lunchEnd: p.lunchEnd || "14:00",
          dailyGoal: p.dailyGoal || 5000,
          color: p.color || "#666",
        })) || [],
      });
    }
  }, [currentOffice, reset]);

  const addProvider = () => {
    appendProvider({
      name: "",
      role: "DOCTOR",
      operatories: ["OP1"],
      workingStart: "07:00",
      workingEnd: "18:00",
      lunchStart: "13:00",
      lunchEnd: "14:00",
      dailyGoal: 5000,
      color: PROVIDER_COLORS[providerFields.length % PROVIDER_COLORS.length],
    });
  };

  const onSubmit = async (data: EditOfficeFormData) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/offices/${officeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: data.name,
          providers: data.providers,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update office");
      }

      toast.success("Office updated successfully!");
      // Refetch to update the store before navigating
      await fetchOffice(officeId);
      router.push(`/offices/${officeId}`);
    } catch (error) {
      console.error("Error updating office:", error);
      toast.error("Failed to update office. Please try again.");
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
        <Link href={`/offices/${officeId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
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
                        <SelectItem value="DOCTOR">Doctor</SelectItem>
                        <SelectItem value="HYGIENIST">Hygienist</SelectItem>
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
                      <Input type="time" {...register(`providers.${index}.workingStart`)} />
                      <span className="self-center">to</span>
                      <Input type="time" {...register(`providers.${index}.workingEnd`)} />
                    </div>
                  </div>
                  <div>
                    <Label>Lunch Break</Label>
                    <div className="flex gap-2">
                      <Input type="time" {...register(`providers.${index}.lunchStart`)} />
                      <span className="self-center">to</span>
                      <Input type="time" {...register(`providers.${index}.lunchEnd`)} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-between">
          <Link href={`/offices/${officeId}`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
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
