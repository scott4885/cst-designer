"use client";

/**
 * Loop 8 — Provider Form Dialog.
 *
 * A focused drawer-style dialog for quickly adding or cloning a provider.
 * Designed for the <90s "add 3 providers" flow: essentials only, auto-focus
 * on name, Enter-to-save, plus a "Save & add another" escape hatch.
 *
 * Advanced fields (per-day hours, procedure mix, time-off, block-type
 * filters) remain on the inline provider card on the main edit page — this
 * dialog keeps its scope deliberately small so it can stay fast.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { ProviderFormEntry } from "@/lib/provider-operations";

const providerFormSchema = z
  .object({
    name: z.string().min(1, "Provider name is required"),
    role: z.enum(["DOCTOR", "HYGIENIST", "OTHER"]),
    operatories: z.array(z.string()).min(1, "Select at least one operatory"),
    workingStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time"),
    workingEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time"),
    lunchEnabled: z.boolean(),
    lunchStart: z.string().optional(),
    lunchEnd: z.string().optional(),
    dailyGoal: z
      .number({ message: "Enter a dollar amount" })
      .min(0, "Goal must be 0 or greater")
      .max(10_000, "Goal cannot exceed $10,000/day"),
    color: z.string().min(4),
  })
  .refine((d) => d.workingEnd > d.workingStart, {
    message: "End time must be after start",
    path: ["workingEnd"],
  });

type ProviderDialogFormData = z.infer<typeof providerFormSchema>;

const OPERATORY_CHOICES = [
  "OP1",
  "OP2",
  "OP3",
  "OP4",
  "OP5",
  "HYG1",
  "HYG2",
  "HYG3",
  "HYG4",
  "Main",
  "Consult Room",
] as const;

const PROVIDER_COLORS = [
  "#ec8a1b",
  "#87bcf3",
  "#f4de37",
  "#44f2ce",
  "#ff6b9d",
  "#9b59b6",
];

export interface ProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the form is submitted with a valid payload. */
  onSubmit: (data: ProviderFormEntry & { _saveAndAddAnother?: boolean }) => void;
  /** Initial values (empty for add, pre-filled for clone). */
  initial?: Partial<ProviderFormEntry>;
  /** Dialog title + description. */
  title?: string;
  description?: string;
  /** Next color to suggest when no initial color is provided. */
  suggestedColor?: string;
}

export default function ProviderFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initial,
  title = "Add Provider",
  description = "Fill in the essentials — fine-tune per-day hours and procedure mix on the main edit card.",
  suggestedColor,
}: ProviderFormDialogProps) {
  const defaults = useMemo<ProviderDialogFormData>(
    () => ({
      name: initial?.name ?? "",
      role: initial?.role ?? "DOCTOR",
      operatories:
        initial?.operatories && initial.operatories.length > 0
          ? initial.operatories
          : ["OP1"],
      workingStart: initial?.workingStart ?? "07:00",
      workingEnd: initial?.workingEnd ?? "16:00",
      lunchEnabled: initial?.lunchEnabled ?? true,
      lunchStart: initial?.lunchStart ?? "12:00",
      lunchEnd: initial?.lunchEnd ?? "13:00",
      dailyGoal: initial?.dailyGoal ?? 5000,
      color: initial?.color ?? suggestedColor ?? PROVIDER_COLORS[0],
    }),
    [initial, suggestedColor]
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProviderDialogFormData>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: defaults,
    mode: "onBlur",
  });

  // Re-seed form whenever the dialog opens (or the initial payload changes).
  useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const { ref: nameRegisterRef, ...nameRegisterRest } = register("name");

  // Autofocus the name field on open.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => nameInputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  const [saveAndAdd, setSaveAndAdd] = useState(false);

  const submit = (data: ProviderDialogFormData) => {
    const payload: ProviderFormEntry & { _saveAndAddAnother?: boolean } = {
      // Carry over fields we don't expose in the dialog (clone preserves them).
      ...(initial ?? ({} as Partial<ProviderFormEntry>)),
      name: data.name.trim(),
      role: data.role,
      operatories: data.operatories,
      workingStart: data.workingStart,
      workingEnd: data.workingEnd,
      lunchEnabled: data.lunchEnabled,
      lunchStart: data.lunchEnabled ? data.lunchStart ?? "12:00" : undefined,
      lunchEnd: data.lunchEnabled ? data.lunchEnd ?? "13:00" : undefined,
      dailyGoal: data.dailyGoal,
      color: data.color,
      // Sensible defaults for fields the dialog doesn't show.
      columns: initial?.columns ?? 1,
      seesNewPatients: initial?.seesNewPatients ?? true,
      enabledBlockTypeIds: initial?.enabledBlockTypeIds ?? [],
      assistedHygiene: initial?.assistedHygiene ?? false,
      providerSchedule: initial?.providerSchedule ?? {},
      staggerOffsetMin: initial?.staggerOffsetMin ?? 0,
      providerId: initial?.providerId ?? "",
      _saveAndAddAnother: saveAndAdd,
    };
    onSubmit(payload);
    if (!saveAndAdd) onOpenChange(false);
    setSaveAndAdd(false);
  };

  const operatories = watch("operatories") ?? ["OP1"];
  const lunchEnabled = watch("lunchEnabled");
  const currentColor = watch("color");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[calc(100vh-4rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(submit)}
          className="space-y-4"
          data-testid="provider-form-dialog"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="provider-dialog-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="provider-dialog-name"
                placeholder="Dr. Jane Smith"
                {...nameRegisterRest}
                ref={(el) => {
                  nameRegisterRef(el);
                  nameInputRef.current = el;
                }}
              />
              {errors.name && (
                <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="provider-dialog-role">Role</Label>
              <Select
                value={watch("role")}
                onValueChange={(v) =>
                  setValue("role", v as "DOCTOR" | "HYGIENIST" | "OTHER", {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger id="provider-dialog-role">
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
            <Label className="mb-2 block">
              Operatories <span className="text-red-500">*</span>
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Click chips to toggle. Provider will work in each selected chair.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {OPERATORY_CHOICES.map((op) => {
                const active = operatories.includes(op);
                return (
                  <button
                    key={op}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? operatories.filter((o) => o !== op)
                        : [...operatories, op];
                      setValue("operatories", next.length > 0 ? next : [op], {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {active && <X className="w-3 h-3 inline-block mr-0.5" />}
                    {!active && <Plus className="w-3 h-3 inline-block mr-0.5" />}
                    {op}
                  </button>
                );
              })}
            </div>
            {errors.operatories && (
              <p className="text-xs text-red-600 mt-1">
                {errors.operatories.message as string}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Working Hours</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="time"
                  {...register("workingStart")}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  {...register("workingEnd")}
                  className="flex-1"
                />
              </div>
              {errors.workingEnd && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.workingEnd.message}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Lunch</Label>
                <Switch
                  checked={lunchEnabled}
                  onCheckedChange={(v) =>
                    setValue("lunchEnabled", v, { shouldDirty: true })
                  }
                />
              </div>
              {lunchEnabled ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    {...register("lunchStart")}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="time"
                    {...register("lunchEnd")}
                    className="flex-1"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic mt-1">
                  No lunch — full day
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="provider-dialog-goal">
                Daily Goal ($) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="provider-dialog-goal"
                type="number"
                min={0}
                max={10000}
                step={100}
                {...register("dailyGoal", { valueAsNumber: true })}
              />
              {errors.dailyGoal && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.dailyGoal.message}
                </p>
              )}
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="color"
                  {...register("color")}
                  className="w-10 h-10 p-1 cursor-pointer rounded-md"
                />
                <div className="flex flex-wrap gap-1 flex-1">
                  {PROVIDER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setValue("color", c, { shouldDirty: true })
                      }
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        currentColor === c
                          ? "border-slate-900 scale-110"
                          : "border-slate-200 hover:border-slate-400"
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setSaveAndAdd(true)}
            >
              Save &amp; add another
            </Button>
            <Button type="submit" disabled={isSubmitting} onClick={() => setSaveAndAdd(false)}>
              Save provider
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
