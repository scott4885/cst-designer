"use client";

/**
 * Loop 8 — Bulk Edit Goals dialog.
 *
 * Presents one row per provider with their current daily goal and a "new
 * goal" input. On submit, emits an array of updated entries; the parent
 * form patches its field array and the normal Save Changes flow persists
 * them. This avoids a brand-new server endpoint while still achieving a
 * one-modal bulk edit.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  validateBulkGoals,
  type BulkGoalEntry,
} from "@/lib/provider-operations";

export interface BulkGoalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provider rows currently in the form's field array. */
  providers: Array<{
    index: number;
    id?: string;
    name: string;
    role: string;
    dailyGoal: number;
  }>;
  /** Called with only the entries whose goals changed. */
  onSubmit: (entries: BulkGoalEntry[]) => void;
}

export default function BulkGoalsDialog({
  open,
  onOpenChange,
  providers,
  onSubmit,
}: BulkGoalsDialogProps) {
  // Local row state: provider index -> pending goal string (easier UX).
  const initial = useMemo(() => {
    const map: Record<number, string> = {};
    for (const p of providers) map[p.index] = String(p.dailyGoal ?? 0);
    return map;
  }, [providers]);

  const [values, setValues] = useState<Record<number, string>>(initial);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [lastOpen, setLastOpen] = useState(open);

  // Reset dialog state when transitioning from closed → open. Using a
  // prevProp-style reset (per React docs "Adjusting state based on props")
  // avoids calling setState inside an effect, which would trigger cascading
  // renders and fail the react-hooks/no-setState-in-effect rule.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setValues(initial);
      setErrors({});
      setFormError(undefined);
    }
  }

  const handleSubmit = () => {
    setFormError(undefined);
    // Only include rows whose goal changed.
    const entries: BulkGoalEntry[] = providers
      .map((p) => ({
        index: p.index,
        providerId: p.id,
        dailyGoal: Number(values[p.index]),
      }))
      .filter((entry, i) => {
        const current = providers[i].dailyGoal;
        return Number.isFinite(entry.dailyGoal) && entry.dailyGoal !== current;
      });

    if (entries.length === 0) {
      setFormError("No changes — adjust at least one goal before saving.");
      return;
    }

    const result = validateBulkGoals({ entries });
    if (!result.ok) {
      // Re-key errors back to the provider row index.
      const mapped: Record<number, string> = {};
      for (const [idxStr, msg] of Object.entries(result.errors)) {
        const entry = entries[Number(idxStr)];
        if (entry) mapped[entry.index] = msg;
      }
      setErrors(mapped);
      if (result.formError) setFormError(result.formError);
      return;
    }

    onSubmit(result.data.entries);
    onOpenChange(false);
  };

  const applyToAll = (amount: number) => {
    const next: Record<number, string> = {};
    for (const p of providers) next[p.index] = String(amount);
    setValues(next);
    setErrors({});
    setFormError(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk edit daily goals</DialogTitle>
          <DialogDescription>
            Update per-provider daily production goals. Changes are staged
            in the form — click &ldquo;Save Changes&rdquo; on the main edit
            page to persist them.
          </DialogDescription>
        </DialogHeader>

        {/* Quick-apply presets */}
        <div className="flex flex-wrap items-center gap-2 text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
          <span className="text-slate-500">Quick apply to all:</span>
          {[3000, 5000, 7500, 10000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => applyToAll(v)}
              className="px-2 py-0.5 rounded-md border border-slate-300 hover:bg-white hover:border-slate-500 transition-colors"
            >
              ${v.toLocaleString()}
            </button>
          ))}
        </div>

        <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
            <span>Provider</span>
            <span className="text-right">Current</span>
            <span className="text-right w-32">New goal ($)</span>
          </div>
          {providers.map((p) => {
            const err = errors[p.index];
            return (
              <div
                key={p.id ?? `idx-${p.index}`}
                className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {p.name || <em className="text-slate-400">(unnamed)</em>}
                  </p>
                  <p className="text-[11px] text-slate-500 uppercase">
                    {p.role}
                  </p>
                </div>
                <p className="text-sm text-slate-500 tabular-nums">
                  ${Number(p.dailyGoal ?? 0).toLocaleString()}
                </p>
                <div className="w-32">
                  <Input
                    type="number"
                    min={0}
                    max={10000}
                    step={100}
                    value={values[p.index] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [p.index]: e.target.value,
                      }))
                    }
                    className={err ? "border-red-500" : ""}
                  />
                  {err && (
                    <p className="text-[11px] text-red-600 mt-0.5">{err}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {formError && (
          <p className="text-sm text-red-600" role="alert">
            {formError}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            Stage goal updates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Exported for the label-style button used on the edit page. */
export function BulkGoalsLabelButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={count === 0}
      className="text-xs"
    >
      Bulk edit goals
    </Button>
  );
}
