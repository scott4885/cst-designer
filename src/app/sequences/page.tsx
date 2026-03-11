"use client";

import { useState, useEffect } from "react";
import { Plus, ChevronDown, ChevronRight, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  BUILT_IN_SEQUENCES,
  deserializeSteps,
  getFollowUpHints,
  type SequenceStep,
  type TreatmentSequence,
} from "@/lib/treatment-sequences";
import type { ProcedureCategory } from "@/lib/engine/types";
import { PROCEDURE_CATEGORY_LABELS } from "@/lib/engine/types";

// ─── Category Color Map ───────────────────────────────────────────────────────

const CAT_COLORS: Record<ProcedureCategory, string> = {
  MAJOR_RESTORATIVE: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  ENDODONTICS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  BASIC_RESTORATIVE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PERIODONTICS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  NEW_PATIENT_DIAG: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  EMERGENCY_ACCESS: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  ORAL_SURGERY: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  PROSTHODONTICS: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiSequence {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  stepsJson: string;
  createdAt: string;
}

function toTreatmentSequence(s: ApiSequence): TreatmentSequence {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    isBuiltIn: s.isBuiltIn,
    steps: deserializeSteps(s.stepsJson),
  };
}

// ─── Step Editor ──────────────────────────────────────────────────────────────

const ALL_CATEGORIES: ProcedureCategory[] = [
  "MAJOR_RESTORATIVE","ENDODONTICS","BASIC_RESTORATIVE","PERIODONTICS",
  "NEW_PATIENT_DIAG","EMERGENCY_ACCESS","ORAL_SURGERY","PROSTHODONTICS",
];

interface StepEditorProps {
  step: SequenceStep;
  onChange: (step: SequenceStep) => void;
  onRemove: () => void;
}

function StepEditor({ step, onChange, onRemove }: StepEditorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg">
      <div>
        <Label className="text-xs mb-1 block">Label</Label>
        <Input
          value={step.label}
          onChange={e => onChange({ ...step, label: e.target.value })}
          placeholder="Step name"
          className="h-8 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs mb-1 block">Category</Label>
        <select
          value={step.category}
          onChange={e => onChange({ ...step, category: e.target.value as ProcedureCategory })}
          className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
        >
          {ALL_CATEGORIES.map(c => (
            <option key={c} value={c}>{PROCEDURE_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs mb-1 block">Duration (min)</Label>
        <Input
          type="number"
          min={5}
          step={5}
          value={step.durationMin}
          onChange={e => onChange({ ...step, durationMin: parseInt(e.target.value) || 30 })}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs mb-1 block">Day Offset</Label>
          <Input
            type="number"
            min={0}
            value={step.dayOffset}
            onChange={e => onChange({ ...step, dayOffset: parseInt(e.target.value) || 0 })}
            className="h-8 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:bg-destructive/10"
          onClick={onRemove}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Add Sequence Form ────────────────────────────────────────────────────────

function AddSequenceForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<SequenceStep[]>([
    { stepIndex: 0, label: "Step 1", category: "BASIC_RESTORATIVE", durationMin: 60, dayOffset: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const addStep = () => {
    const last = steps[steps.length - 1];
    setSteps(prev => [
      ...prev,
      {
        stepIndex: prev.length,
        label: `Step ${prev.length + 1}`,
        category: "BASIC_RESTORATIVE",
        durationMin: 60,
        dayOffset: last.dayOffset + 14,
      },
    ]);
  };

  const updateStep = (i: number, step: SequenceStep) => {
    setSteps(prev => prev.map((s, idx) => (idx === i ? { ...step, stepIndex: idx } : s)));
  };

  const removeStep = (i: number) => {
    setSteps(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stepIndex: idx })));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (steps.length === 0) { toast.error("Add at least one step"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, stepsJson: JSON.stringify(steps) }),
      });
      if (!res.ok) throw new Error("Failed to create sequence");
      toast.success(`Sequence "${name}" created`);
      setName("");
      setDescription("");
      setSteps([{ stepIndex: 0, label: "Step 1", category: "BASIC_RESTORATIVE", durationMin: 60, dayOffset: 0 }]);
      onCreated();
    } catch {
      toast.error("Failed to create sequence");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-5 bg-card border rounded-lg">
      <h2 className="font-semibold">New Sequence</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-sm mb-1 block">Sequence Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bridge Series" />
        </div>
        <div>
          <Label className="text-sm mb-1 block">Description</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Steps</Label>
        {steps.map((step, i) => (
          <StepEditor
            key={i}
            step={step}
            onChange={s => updateStep(i, s)}
            onRemove={() => removeStep(i)}
          />
        ))}
        <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={addStep}>
          <Plus className="w-3.5 h-3.5" />
          Add Step
        </Button>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Sequence"}
        </Button>
      </div>
    </div>
  );
}

// ─── Sequence Card ────────────────────────────────────────────────────────────

function SequenceCard({
  sequence,
  onDelete,
}: {
  sequence: TreatmentSequence;
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const followUpHints = getFollowUpHints(sequence);

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{sequence.name}</h3>
            {sequence.isBuiltIn && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                <Lock className="w-2.5 h-2.5" />
                Built-in
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {sequence.steps.length} step{sequence.steps.length !== 1 ? "s" : ""}
            </span>
          </div>
          {sequence.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{sequence.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!sequence.isBuiltIn && onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Quick step summary */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {sequence.steps.map((step, i) => (
          <span
            key={i}
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[step.category]}`}
          >
            {i + 1}. {step.label}
          </span>
        ))}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-4 space-y-2 border-t pt-4">
          {sequence.steps.map((step, i) => {
            const hint = followUpHints.find(h => h.step.stepIndex === step.stepIndex)?.hint;
            return (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-muted-foreground ml-2">{step.durationMin} min</span>
                  {hint && (
                    <span className="text-muted-foreground ml-2 text-xs">({hint})</span>
                  )}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${CAT_COLORS[step.category]}`}>
                  {PROCEDURE_CATEGORY_LABELS[step.category]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SequencesPage() {
  const [sequences, setSequences] = useState<TreatmentSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchSequences = async () => {
    try {
      const res = await fetch("/api/sequences");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: ApiSequence[] = await res.json();
      setSequences(data.map(toTreatmentSequence));
    } catch {
      // Fallback to built-in sequences for demo
      setSequences(BUILT_IN_SEQUENCES);
      toast.error("Could not load sequences from server — showing built-ins");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSequences();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete sequence "${name}"?`)) return;
    try {
      const res = await fetch(`/api/sequences/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(`Sequence "${name}" deleted`);
      fetchSequences();
    } catch {
      toast.error("Failed to delete sequence");
    }
  };

  const builtIns = sequences.filter(s => s.isBuiltIn);
  const custom = sequences.filter(s => !s.isBuiltIn);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Treatment Sequences</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pre-defined appointment sequences for clinical scheduling
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setShowAddForm(v => !v)}>
          <Plus className="w-4 h-4" />
          Add Sequence
        </Button>
      </div>

      {showAddForm && (
        <AddSequenceForm
          onCreated={() => {
            fetchSequences();
            setShowAddForm(false);
          }}
        />
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Built-in */}
          <div>
            <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-3 tracking-wide">
              Built-in Sequences ({builtIns.length})
            </h2>
            <div className="space-y-3">
              {builtIns.map(seq => (
                <SequenceCard key={seq.id} sequence={seq} />
              ))}
            </div>
          </div>

          {/* Custom */}
          {custom.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-3 tracking-wide">
                Custom Sequences ({custom.length})
              </h2>
              <div className="space-y-3">
                {custom.map(seq => (
                  <SequenceCard
                    key={seq.id}
                    sequence={seq}
                    onDelete={() => handleDelete(seq.id, seq.name)}
                  />
                ))}
              </div>
            </div>
          )}

          {custom.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
              No custom sequences yet.{" "}
              <button
                onClick={() => setShowAddForm(true)}
                className="underline hover:text-foreground"
              >
                Create one
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
