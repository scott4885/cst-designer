"use client";

import { useState, useMemo, useEffect } from "react";
import { Copy, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  CopyDayOptions,
  CopyDayResult,
} from "@/store/schedule-store";

function Checkbox({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (c: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
    />
  );
}

interface CopyDayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceDay: string;
  workingDays: string[];
  daysWithSchedules: string[];
  variantLabelsByDay: Record<string, string | null | undefined>;
  onCopy: (targetDays: string[], options: CopyDayOptions) => CopyDayResult;
}

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

function shortLabel(day: string): string {
  return DAY_LABELS[day]?.slice(0, 3) ?? day.slice(0, 3);
}

export default function CopyDayModal({
  open,
  onOpenChange,
  sourceDay,
  workingDays,
  daysWithSchedules,
  variantLabelsByDay,
  onCopy,
}: CopyDayModalProps) {
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [includeDoctor, setIncludeDoctor] = useState(true);
  const [includeHygiene, setIncludeHygiene] = useState(true);
  const [includeLunch, setIncludeLunch] = useState(true);
  const [includeVariant, setIncludeVariant] = useState(false);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [lastResult, setLastResult] = useState<CopyDayResult | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedTargets(new Set());
      setLastResult(null);
    }
  }, [open, sourceDay]);

  const targetCandidates = useMemo(
    () => workingDays.filter((d) => d !== sourceDay),
    [workingDays, sourceDay],
  );

  const toggleDay = (day: string) => {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleCopy = () => {
    if (selectedTargets.size === 0) return;
    const res = onCopy(Array.from(selectedTargets), {
      includeDoctor,
      includeHygiene,
      includeLunch,
      includeVariant,
      mode,
    });
    setLastResult(res);
  };

  const handleClose = () => {
    setLastResult(null);
    onOpenChange(false);
  };

  const canSubmit = selectedTargets.size > 0 && (includeDoctor || includeHygiene || includeLunch);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 bg-white">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
            <Copy className="w-5 h-5 text-blue-600" />
            Copy {DAY_LABELS[sourceDay] ?? sourceDay} to…
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Copy blocks from <strong>{DAY_LABELS[sourceDay] ?? sourceDay}</strong> to other days of
            the week. Undo (Ctrl+Z) reverts the entire copy in one step.
          </p>
        </div>

        {!lastResult && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Target days */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Target days</Label>
                <div className="flex gap-2 flex-wrap">
                  {/* Source day shown disabled */}
                  <button
                    type="button"
                    disabled
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    title="Source day"
                  >
                    {shortLabel(sourceDay)} (source)
                  </button>
                  {targetCandidates.map((day) => {
                    const isSelected = selectedTargets.has(day);
                    const variant = variantLabelsByDay[day];
                    const hasSchedule = daysWithSchedules.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        disabled={!hasSchedule}
                        title={!hasSchedule ? "Generate this day first before copying into it" : undefined}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600"
                            : hasSchedule
                              ? "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                              : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                        }`}
                      >
                        {shortLabel(day)}
                        {variant ? (
                          <span
                            className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              isSelected ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {variant}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {selectedTargets.size > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {selectedTargets.size} day{selectedTargets.size > 1 ? "s" : ""} selected
                  </p>
                )}
              </div>

              {/* Elements */}
              <div>
                <Label className="text-sm font-medium mb-2 block">What to copy</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={includeDoctor}
                      onCheckedChange={setIncludeDoctor}
                    />
                    <span>Doctor blocks</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={includeHygiene}
                      onCheckedChange={setIncludeHygiene}
                    />
                    <span>Hygiene blocks</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={includeLunch}
                      onCheckedChange={setIncludeLunch}
                    />
                    <span>Lunch positions</span>
                    <span className="text-xs text-slate-400">(preserves existing breaks)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={includeVariant}
                      onCheckedChange={setIncludeVariant}
                    />
                    <span>Variant markers</span>
                    <span className="text-xs text-slate-400">(EOF / Opt1 / Opt2 tag)</span>
                  </label>
                </div>
              </div>

              {/* Mode radio */}
              <div>
                <Label className="text-sm font-medium mb-2 block">When target already has blocks</Label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`border rounded-md px-3 py-2 cursor-pointer text-sm ${
                      mode === "replace"
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name="copy-mode"
                      value="replace"
                      checked={mode === "replace"}
                      onChange={() => setMode("replace")}
                    />
                    <div className="font-medium text-slate-800">Replace</div>
                    <div className="text-xs text-slate-500">Wipe target blocks first</div>
                  </label>
                  <label
                    className={`border rounded-md px-3 py-2 cursor-pointer text-sm ${
                      mode === "merge"
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name="copy-mode"
                      value="merge"
                      checked={mode === "merge"}
                      onChange={() => setMode("merge")}
                    />
                    <div className="font-medium text-slate-800">Merge</div>
                    <div className="text-xs text-slate-500">Skip filled target slots</div>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCopy}
                disabled={!canSubmit}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Copy to {selectedTargets.size} day{selectedTargets.size === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}

        {lastResult && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">
                    Copied {lastResult.blocksCopied} block{lastResult.blocksCopied === 1 ? "" : "s"} to{" "}
                    {lastResult.copiedDays.length} day
                    {lastResult.copiedDays.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    {lastResult.copiedDays.map((d) => DAY_LABELS[d] ?? d).join(", ") || "(none)"}
                  </p>
                  <p className="text-xs text-slate-600 mt-2">
                    Press <kbd className="px-1 py-0.5 bg-white border rounded text-[10px]">Ctrl+Z</kbd>{" "}
                    to undo the entire copy in one step.
                  </p>
                </div>
              </div>
              {lastResult.warnings.length > 0 && (
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 space-y-1">
                    {lastResult.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </div>
                </div>
              )}
              {lastResult.skippedDays.length > 0 && (
                <p className="text-xs text-slate-500">
                  Skipped: {lastResult.skippedDays.map((d) => DAY_LABELS[d] ?? d).join(", ")}
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end bg-slate-50">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
