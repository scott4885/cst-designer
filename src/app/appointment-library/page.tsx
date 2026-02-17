"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, BookOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useBlockTypeStore, type LibraryBlockType } from "@/store/block-type-store";

// ────────────────────────────────────────────────────────────────────────────
// Form state
// ────────────────────────────────────────────────────────────────────────────

interface BlockTypeFormData {
  label: string;
  description: string;
  appliesToRole: "DOCTOR" | "HYGIENIST" | "BOTH";
  durationMin: string;
  durationMax: string;
  minimumAmount: string;
  color: string;
}

const EMPTY_FORM: BlockTypeFormData = {
  label: "",
  description: "",
  appliesToRole: "DOCTOR",
  durationMin: "30",
  durationMax: "",
  minimumAmount: "",
  color: "#6366f1",
};

const ROLE_LABELS: Record<string, string> = {
  DOCTOR: "Doctor",
  HYGIENIST: "Hygienist",
  BOTH: "Both",
};

const ROLE_COLORS: Record<string, string> = {
  DOCTOR: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  HYGIENIST: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  BOTH: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
};

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

// ────────────────────────────────────────────────────────────────────────────
// BlockTypeForm component (shared between add/edit)
// ────────────────────────────────────────────────────────────────────────────

interface BlockTypeFormProps {
  initial?: BlockTypeFormData;
  onSave: (data: BlockTypeFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  mode: "add" | "edit";
}

function BlockTypeForm({ initial = EMPTY_FORM, onSave, onCancel, isSubmitting, mode }: BlockTypeFormProps) {
  const [form, setForm] = useState<BlockTypeFormData>(initial);
  const [errors, setErrors] = useState<Partial<BlockTypeFormData>>({});

  const set = (field: keyof BlockTypeFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<BlockTypeFormData> = {};

    if (!form.label.trim()) newErrors.label = "Label is required";

    const min = Number(form.durationMin);
    if (!form.durationMin || isNaN(min) || min < 0) {
      newErrors.durationMin = "Must be a positive number";
    }

    if (form.durationMax) {
      const max = Number(form.durationMax);
      if (isNaN(max) || max < min) {
        newErrors.durationMax = "Max must be ≥ min duration";
      }
    }

    if (form.minimumAmount) {
      const amt = Number(form.minimumAmount);
      if (isNaN(amt) || amt < 0) {
        newErrors.minimumAmount = "Must be a non-negative number";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) onSave(form);
  };

  return (
    <div className="space-y-4">
      {/* Label */}
      <div className="space-y-1.5">
        <Label htmlFor="bt-label">
          Label <span className="text-destructive">*</span>
        </Label>
        <Input
          id="bt-label"
          value={form.label}
          onChange={(e) => set("label", e.target.value)}
          placeholder="e.g., Implant Placement"
          aria-invalid={!!errors.label}
        />
        {errors.label && <p className="text-xs text-destructive">{errors.label}</p>}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="bt-desc">Description</Label>
        <Textarea
          id="bt-desc"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Brief description of this appointment type"
          rows={2}
          className="resize-none"
        />
      </div>

      {/* Role */}
      <div className="space-y-1.5">
        <Label>Applies To</Label>
        <Select
          value={form.appliesToRole}
          onValueChange={(v) => set("appliesToRole", v as any)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DOCTOR">Doctor</SelectItem>
            <SelectItem value="HYGIENIST">Hygienist</SelectItem>
            <SelectItem value="BOTH">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Durations */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bt-dur-min">
            Duration Min (min) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="bt-dur-min"
            type="number"
            min={0}
            value={form.durationMin}
            onChange={(e) => set("durationMin", e.target.value)}
            placeholder="30"
            aria-invalid={!!errors.durationMin}
          />
          {errors.durationMin && <p className="text-xs text-destructive">{errors.durationMin}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bt-dur-max">Duration Max (min)</Label>
          <Input
            id="bt-dur-max"
            type="number"
            min={0}
            value={form.durationMax}
            onChange={(e) => set("durationMax", e.target.value)}
            placeholder="Optional"
            aria-invalid={!!errors.durationMax}
          />
          {errors.durationMax && <p className="text-xs text-destructive">{errors.durationMax}</p>}
        </div>
      </div>

      {/* Minimum Amount */}
      <div className="space-y-1.5">
        <Label htmlFor="bt-min-amt">Minimum Production ($)</Label>
        <Input
          id="bt-min-amt"
          type="number"
          min={0}
          value={form.minimumAmount}
          onChange={(e) => set("minimumAmount", e.target.value)}
          placeholder="e.g., 1200"
          aria-invalid={!!errors.minimumAmount}
        />
        {errors.minimumAmount && <p className="text-xs text-destructive">{errors.minimumAmount}</p>}
      </div>

      {/* Color */}
      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={form.color}
            onChange={(e) => set("color", e.target.value)}
            className="w-9 h-9 rounded border border-border cursor-pointer bg-transparent p-0.5"
            aria-label="Color picker"
          />
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: form.color === c ? "white" : "transparent",
                  outline: form.color === c ? `2px solid ${c}` : "none",
                }}
                onClick={() => set("color", c)}
                aria-label={`Select color ${c}`}
              />
            ))}
          </div>
        </div>
      </div>

      <Separator />

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : mode === "add" ? "Add Type" : "Save Changes"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────

export default function AppointmentLibraryPage() {
  const { blockTypes, initFromStorage, addBlockType, updateBlockType, deleteBlockType, resetToDefaults } =
    useBlockTypeStore();

  // Dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LibraryBlockType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryBlockType | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [filterRole, setFilterRole] = useState<"ALL" | "DOCTOR" | "HYGIENIST" | "BOTH">("ALL");

  // Initialize from localStorage on mount
  useEffect(() => {
    document.title = "Appointment Library - Schedule Template Designer";
    initFromStorage();
  }, [initFromStorage]);

  const filtered = blockTypes.filter(
    (bt) => filterRole === "ALL" || bt.appliesToRole === filterRole
  );

  const doctorCount = blockTypes.filter((bt) => bt.appliesToRole === "DOCTOR").length;
  const hygienistCount = blockTypes.filter((bt) => bt.appliesToRole === "HYGIENIST").length;
  const bothCount = blockTypes.filter((bt) => bt.appliesToRole === "BOTH").length;
  const customCount = blockTypes.filter((bt) => bt.isCustom).length;

  // ── Add ──────────────────────────────────────────────────────────────────

  const handleAdd = (data: BlockTypeFormData) => {
    const result = addBlockType({
      label: data.label,
      description: data.description || undefined,
      appliesToRole: data.appliesToRole,
      durationMin: Number(data.durationMin),
      durationMax: data.durationMax ? Number(data.durationMax) : undefined,
      minimumAmount: data.minimumAmount ? Number(data.minimumAmount) : undefined,
      color: data.color,
    });

    if (result.success) {
      toast.success(`"${result.blockType.label}" added to library`);
      setAddOpen(false);
    } else {
      toast.error(result.error);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────

  const handleEdit = (data: BlockTypeFormData) => {
    if (!editTarget) return;
    const success = updateBlockType(editTarget.id, {
      label: data.label,
      description: data.description || undefined,
      appliesToRole: data.appliesToRole,
      durationMin: Number(data.durationMin),
      durationMax: data.durationMax ? Number(data.durationMax) : undefined,
      minimumAmount: data.minimumAmount ? Number(data.minimumAmount) : undefined,
      color: data.color,
    });

    if (success) {
      toast.success(`"${data.label}" updated`);
      setEditTarget(null);
    } else {
      toast.error("Failed to update — a block type with that name already exists");
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = () => {
    if (!deleteTarget) return;
    const success = deleteBlockType(deleteTarget.id);
    if (success) {
      toast.success(`"${deleteTarget.label}" removed from library`);
    } else {
      toast.error("Could not delete a built-in appointment type");
    }
    setDeleteTarget(null);
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    resetToDefaults();
    toast.success("Library reset to defaults");
    setResetOpen(false);
  };

  // ── Edit initial form value ───────────────────────────────────────────────

  const editInitial = editTarget
    ? ({
        label: editTarget.label,
        description: editTarget.description ?? "",
        appliesToRole: editTarget.appliesToRole,
        durationMin: String(editTarget.durationMin),
        durationMax: editTarget.durationMax != null ? String(editTarget.durationMax) : "",
        minimumAmount: editTarget.minimumAmount != null ? String(editTarget.minimumAmount) : "",
        color: editTarget.color ?? "#6366f1",
      } satisfies BlockTypeFormData)
    : EMPTY_FORM;

  return (
    <div className="max-w-5xl space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Appointment Type Library</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage the global library of block types used across all offices
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetOpen(true)}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Defaults
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            New Type
          </Button>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Types", value: blockTypes.length },
          { label: "Doctor Types", value: doctorCount },
          { label: "Hygienist Types", value: hygienistCount },
          { label: "Custom Types", value: customCount },
        ].map(({ label, value }) => (
          <Card key={label} className="py-3">
            <CardContent className="px-4 py-0">
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter by role:</span>
        {(["ALL", "DOCTOR", "HYGIENIST", "BOTH"] as const).map((role) => (
          <Button
            key={role}
            variant={filterRole === role ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterRole(role)}
          >
            {role === "ALL"
              ? `All (${blockTypes.length})`
              : role === "DOCTOR"
              ? `Doctor (${doctorCount})`
              : role === "HYGIENIST"
              ? `Hygienist (${hygienistCount})`
              : `Both (${bothCount})`}
          </Button>
        ))}
      </div>

      {/* ── Block type grid ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No appointment types found</p>
          <p className="text-sm mt-1">Add a new type to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((bt) => (
            <BlockTypeCard
              key={bt.id}
              blockType={bt}
              onEdit={() => setEditTarget(bt)}
              onDelete={() => setDeleteTarget(bt)}
            />
          ))}
        </div>
      )}

      {/* ── Add dialog ───────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Appointment Type</DialogTitle>
            <DialogDescription>
              Add a custom appointment block to the global library.
            </DialogDescription>
          </DialogHeader>
          <BlockTypeForm
            mode="add"
            onSave={handleAdd}
            onCancel={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ──────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Appointment Type</DialogTitle>
            <DialogDescription>
              Update the details of "{editTarget?.label}".
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <BlockTypeForm
              mode="edit"
              initial={editInitial}
              onSave={handleEdit}
              onCancel={() => setEditTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Appointment Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">"{deleteTarget?.label}"</span>{" "}
              from the library? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset confirmation dialog ─────────────────────────────────────── */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset to Defaults</DialogTitle>
            <DialogDescription>
              This will remove all custom appointment types and restore the original defaults.
              Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Reset Library
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// BlockTypeCard sub-component
// ────────────────────────────────────────────────────────────────────────────

interface BlockTypeCardProps {
  blockType: LibraryBlockType;
  onEdit: () => void;
  onDelete: () => void;
}

function BlockTypeCard({ blockType, onEdit, onDelete }: BlockTypeCardProps) {
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      {/* Color accent bar */}
      {blockType.color && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
          style={{ backgroundColor: blockType.color }}
        />
      )}

      <CardHeader className="pb-2 pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="text-sm font-semibold truncate">
              {blockType.label}
            </CardTitle>
            {blockType.isCustom && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-accent/40 text-accent">
                Custom
              </Badge>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
              aria-label={`Edit ${blockType.label}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {blockType.isCustom && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:text-destructive"
                onClick={onDelete}
                aria-label={`Delete ${blockType.label}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${ROLE_COLORS[blockType.appliesToRole] ?? ""}`}
          >
            {ROLE_LABELS[blockType.appliesToRole] ?? blockType.appliesToRole}
          </span>
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
            {blockType.durationMin}
            {blockType.durationMax ? `–${blockType.durationMax}` : ""}
            {" "}min
          </span>
          {blockType.minimumAmount != null && blockType.minimumAmount > 0 && (
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              ${blockType.minimumAmount.toLocaleString()}+
            </span>
          )}
        </div>
      </CardHeader>

      {blockType.description && (
        <CardContent className="pt-0 pl-5">
          <p className="text-xs text-muted-foreground line-clamp-2">{blockType.description}</p>
        </CardContent>
      )}
    </Card>
  );
}
